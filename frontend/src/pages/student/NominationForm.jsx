/*
 * Page: NominationForm
 *
 * Allows students to submit their nomination for class elections, view and accept nomination policy,
 * and upload manifesto/photo. Also fetches and displays the student's current nomination if it exists.
 *
 * Features:
 *   - Fetches available elections and nomination policy
 *   - Allows policy acceptance and nomination submission
 *   - Displays error and success messages
 *
 * Usage:
 *   Rendered as part of the student dashboard routes.
 */

import React, { useEffect, useRef, useState } from 'react';
import Navbar from '../../components/Navbar';
import { getMyElections } from '../../api/electionApi';
import { submitNomination, getMyNomination } from '../../api/nominationApi';
import { getPolicy, acceptPolicy, getPolicyStatus } from '../../api/policyApi';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';

const VOICE_OPTIONS = [
  { id: 'FEMALE', label: 'Female' },
  { id: 'MALE', label: 'Male' },
];

export default function NominationForm() {
  const [election, setElection] = useState(null);
  const [allElections, setAllElections] = useState([]);
  const [myNomination, setMyNomination] = useState(null);
  const [manifesto, setManifesto] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [policy, setPolicy] = useState(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policyStatusByElection, setPolicyStatusByElection] = useState({});
  const [nominationsByElection, setNominationsByElection] = useState({}); // Track nominations per election
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voiceOption, setVoiceOption] = useState('FEMALE');
  const [speechRate, setSpeechRate] = useState(0.95);
  const utteranceRef = useRef(null);
  const stopRequestedRef = useRef(false);

  const stopSpeech = () => {
    stopRequestedRef.current = true;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setIsSpeaking(false);
  };

  const detectGenderFromVoice = (voice) => {
    const t = `${voice?.name || ''} ${voice?.voiceURI || ''}`.toLowerCase();
    if (/female|woman|neerja|aria|zira|jenny|sara|emma|samantha|susan/i.test(t)) return 'FEMALE';
    if (/male|man|prabhat|guy|davis|david|mark|roger|jacob|brandon|alex/i.test(t)) return 'MALE';
    return 'UNKNOWN';
  };

  const getPreferredVoice = (option, allVoices) => {
    const candidates = getVoiceCandidates(option, allVoices);
    return candidates[0] || null;
  };

  const getVoiceCandidates = (option, allVoices) => {
    const list = allVoices || [];
    const byGender = (arr, g) => arr.filter((v) => detectGenderFromVoice(v) === g);
    const byName = (arr, regex) => arr.find((v) => regex.test(`${v.name} ${v.voiceURI}`));
    const uniq = (arr) => {
      const seen = new Set();
      return arr.filter((v) => {
        const key = v?.voiceURI || `${v?.name}-${v?.lang}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    if (option === 'FEMALE') {
      return uniq([
        byName(list, /neerja|aria|zira|jenny|sara|emma|samantha|susan/i),
        ...byGender(list, 'FEMALE'),
      ].filter(Boolean));
    }

    if (option === 'MALE') {
      return uniq([
        byName(list, /prabhat|guy|davis|david|mark|roger|jacob|brandon|alex/i),
        ...byGender(list, 'MALE'),
      ].filter(Boolean));
    }

    return list;
  };

  const speakNominationPolicyDeclaration = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setSpeechSupported(false);
      setErr('Speech is not supported in this browser.');
      return;
    }
    if (!policy?.policy_text) {
      setErr('Nomination policy text is not available to speak.');
      return;
    }

    stopSpeech();
    stopRequestedRef.current = false;
    setErr('');

    const liveVoices = window.speechSynthesis.getVoices() || voices || [];
    const selectedVoice = getPreferredVoice(voiceOption, liveVoices);
    const cleanPolicy = String(policy.policy_text).replace(/\s+/g, ' ').trim();
    const declaration = `Nomination policy declaration. Please listen carefully before accepting. ${cleanPolicy}`;

    const utterance = new window.SpeechSynthesisUtterance(declaration);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
    utterance.rate = Number(speechRate) || 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
      if (stopRequestedRef.current) return;
      setErr('Failed to play policy declaration speech.');
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await getMyElections();
        setAllElections(list || []);
        
        // Fetch policy
        try {
          const p = await getPolicy('Nomination Policy');
          setPolicy(p);
          
          // Check policy acceptance status AND nominations for each election
          if (list && list.length > 0) {
            const statusMap = {};
            const nominationsMap = {};
            
            for (const election of list) {
              try {
                // Check policy status
                const status = await getPolicyStatus('Nomination Policy', election.election_id);
                statusMap[election.election_id] = status.accepted || false;
                
                // Check if already nominated
                try {
                  const nomination = await getMyNomination(election.election_id);
                  if (nomination && nomination.nomination_id) {
                    nominationsMap[election.election_id] = nomination;
                  }
                } catch {
                  // No nomination found
                }
              } catch {
                statusMap[election.election_id] = false;
              }
            }
            setPolicyStatusByElection(statusMap);
            setNominationsByElection(nominationsMap);
          }
        } catch {}
      } catch (error) {
        setErr(error.response?.data?.error || 'Failed to load elections');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setMyNomination(null);
      if (!election) return;
      try {
        const mine = await getMyNomination(election.election_id);
        setMyNomination(mine);
        if (mine && mine.manifesto) setManifesto(mine.manifesto);
        if (mine && mine.photo_url) setPhotoPreview(toDirectImageUrl(mine.photo_url));
      } catch {}
    })();
  }, [election]);

  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
      stopSpeech();
    };
  }, [photoPreview]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
    setSpeechSupported(supported);
    if (!supported) return;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices() || [];
      const englishVoices = allVoices.filter((v) => String(v.lang || '').toLowerCase().startsWith('en'));
      const usable = englishVoices.length ? englishVoices : allVoices;
      setVoices(usable);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const toDirectImageUrl = (url) => {
    try {
      if (!url) return url;
      // Handle Google Drive share links
      // Formats:
      // - https://drive.google.com/file/d/FILE_ID/view?usp=sharing -> https://drive.google.com/uc?export=view&id=FILE_ID
      // - https://drive.google.com/open?id=FILE_ID -> https://drive.google.com/uc?export=view&id=FILE_ID
      let m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
      m = url.match(/[?&]id=([^&]+)/);
      if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
      return url;
    } catch {
      return url;
    }
  };

  const handleNominateClick = async (e) => {
    // Check if student has already nominated for this election
    try {
      const mine = await getMyNomination(e.election_id);
      if (mine && mine.nomination_id) {
        setErr('You have already submitted a nomination for this election. You can only nominate once per election.');
        return;
      }
    } catch {
      // No nomination found, continue
    }
    
    // Check if policy is already accepted for this election
    const isAccepted = policyStatusByElection[e.election_id];
    
    if (policy && !isAccepted) {
      setElection(e); // Set election first so we have the ID for policy acceptance
      setShowPolicy(true);
      return;
    }
    
    // Policy already accepted, proceed to nomination
    setElection(e);
  };
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    setErr('');
    setPhotoFile(null);
    setPhotoPreview('');

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Please upload a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr('Photo must be 5 MB or smaller.');
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setErr('');
    setMsg('');
    try {
      if (!election) throw new Error('Select an election where nominations are open');
      if (myNomination)
        throw new Error('You have already submitted a nomination for this election');
      // Policy already checked when clicking "Nominate" button
      const formData = new FormData();
      formData.append('election_id', election.election_id);
      formData.append('manifesto', manifesto);
      if (photoFile) formData.append('photo', photoFile);

      const res = await submitNomination(formData);
      setMsg(res?.message || 'Nomination submitted');
      
      // Fetch the newly created nomination to get full details including status
      try {
        const newNomination = await getMyNomination(election.election_id);
        if (newNomination && newNomination.nomination_id) {
          // Update the nominations map to hide the nominate button
          setNominationsByElection(prev => ({
            ...prev,
            [election.election_id]: newNomination
          }));
          setMyNomination(newNomination);
        } else {
          // Fallback if fetch fails
          setMyNomination({ submitted: true, status: 'PENDING' });
          setNominationsByElection(prev => ({
            ...prev,
            [election.election_id]: { submitted: true, status: 'PENDING' }
          }));
        }
      } catch {
        // Fallback if fetch fails
        setMyNomination({ submitted: true, status: 'PENDING' });
        setNominationsByElection(prev => ({
          ...prev,
          [election.election_id]: { submitted: true, status: 'PENDING' }
        }));
      }
      
      // Clear form fields
      setManifesto('');
      setPhotoFile(null);
      setPhotoPreview('');
    } catch (error) {
      setErr(error.response?.data?.error || error.message || 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-4">Nomination</h1>
        {err && (
          <Alert kind="danger" className="mb-2">
            {err}
          </Alert>
        )}
        {msg && (
          <Alert kind="success" className="mb-2">
            {msg}
          </Alert>
        )}

        {/* Show nomination form only if election is active and student has not nominated - MOVE TO TOP */}
        {election &&
          (() => {
            const now = Date.now();
            const ns = new Date(election.nomination_start).getTime();
            const ne = new Date(election.nomination_end).getTime();
            const open = now >= ns && now <= ne;
            if (!open || myNomination) return null;
            return (
              <div className="bg-white p-4 rounded shadow max-w-xl mb-6">
                <h3 className="font-semibold mb-2">
                  Submit Nomination for Election #{election.election_id}
                </h3>
                <form onSubmit={submit}>
                  <label className="block text-sm mb-2">
                    Manifesto <span className="text-red-600">*</span>
                    <textarea
                      value={manifesto}
                      onChange={(e) => setManifesto(e.target.value)}
                      placeholder="Your manifesto"
                      className="border p-2 w-full h-32 mt-1 mb-3"
                      required
                    />
                  </label>
                  <label className="block text-sm mb-2">
                    Photo (optional)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="border p-2 w-full mt-1 mb-3"
                    />
                  </label>
                  {photoPreview && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-600 mb-1">Selected photo preview</div>
                      <img
                        src={photoPreview}
                        alt="Selected nominee"
                        className="w-24 h-24 rounded-full object-cover border"
                      />
                    </div>
                  )}
                  <Button disabled={!manifesto || isSubmitting} className="px-4">
                    {isSubmitting ? 'Submitting...' : 'Submit Nomination'}
                  </Button>
                </form>
              </div>
            );
          })()}

        {/* Show manifesto and photo at the top if nomination is started and exists */}
        {election &&
          (() => {
            const now = Date.now();
            const ns = new Date(election.nomination_start).getTime();
            const ne = new Date(election.nomination_end).getTime();
            const open = now >= ns && now <= ne;
            if (open && myNomination) {
              return (
                <div className="bg-white p-4 rounded shadow max-w-xl mb-6">
                  <h3 className="font-semibold mb-2">
                    Your Nomination for Election #{election.election_id}
                  </h3>

                  {/* Status Badge */}
                  <div className="mb-3">
                    <span
                      className={`inline-block px-3 py-1 rounded text-sm font-semibold ${
                        myNomination.status === 'APPROVED'
                          ? 'bg-green-100 text-green-800'
                          : myNomination.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {myNomination.status || 'PENDING'}
                    </span>
                  </div>

                  {/* Rejection Reason */}
                  {myNomination.status === 'REJECTED' && myNomination.rejection_reason && (
                    <div className="mb-3 p-4 bg-red-50 border-l-4 border-red-500 rounded">
                      <div className="flex items-start">
                        <svg
                          className="w-5 h-5 text-red-500 mt-0.5 mr-2 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div>
                          <strong className="text-red-900 block mb-1">Rejection Reason:</strong>
                          <p className="text-red-700 text-sm whitespace-pre-wrap">
                            {myNomination.rejection_reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Approval Message */}
                  {myNomination.status === 'APPROVED' && (
                    <div className="mb-3 p-4 bg-green-50 border-l-4 border-green-500 rounded">
                      <div className="flex items-start">
                        <svg
                          className="w-5 h-5 text-green-500 mt-0.5 mr-2 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div>
                          <strong className="text-green-900 block mb-1">
                            Nomination Approved!
                          </strong>
                          <p className="text-green-700 text-sm">
                            Congratulations! Your nomination has been approved. You are now
                            officially a candidate for this election. Students will be able to view
                            your manifesto and vote for you when voting begins.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pending Message */}
                  {(!myNomination.status || myNomination.status === 'PENDING') && (
                    <Alert kind="warning" className="mb-3">
                      <strong>⏳ Under Review:</strong> Your nomination is pending admin review. You
                      will be notified via email once a decision is made.
                    </Alert>
                  )}

                  {myNomination.status === 'REJECTED' && (
                    <Alert kind="danger" className="mb-3">
                      <strong>Nomination Rejected:</strong> Unfortunately, your nomination was not
                      approved. See the reason above. You may contact the admin for clarification.
                      <br />
                      <span className="text-xs mt-1 block">Note: You can only nominate once per election, even if rejected. This election is now closed for you.</span>
                    </Alert>
                  )}

                  <div className="mb-2">
                    <div className="font-semibold">Manifesto:</div>
                    <div className="border p-2 bg-gray-50 whitespace-pre-wrap">
                      {myNomination.manifesto}
                    </div>
                  </div>
                  {myNomination.photo_url && (
                    <div className="mb-2">
                      <div className="font-semibold">Photo:</div>
                      <img
                        src={toDirectImageUrl(myNomination.photo_url)}
                        alt="Nominee"
                        className="max-w-xs rounded border"
                      />
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })()}

        {/* Show only active nominations in the election list */}
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">Active Class Elections</h2>
          <ul className="divide-y">
            {(allElections || [])
              .filter((e) => {
                const now = Date.now();
                const ns = new Date(e.nomination_start).getTime();
                const ne = new Date(e.nomination_end).getTime();
                return now >= ns && now <= ne;
              })
              .map((e) => {
                const now = Date.now();
                const ns = new Date(e.nomination_start).getTime();
                const ne = new Date(e.nomination_end).getTime();
                const open = now >= ns && now <= ne;
                const hasNominated = nominationsByElection[e.election_id];
                
                return (
                  <li key={e.election_id} className="py-3 flex items-center justify-between">
                    <div className="text-sm flex-1">
                      <div className="font-medium">Election #{e.election_id}</div>
                      <div className="text-gray-600">
                        Nominations: {new Date(e.nomination_start).toLocaleString()} -{' '}
                        {new Date(e.nomination_end).toLocaleString()}
                      </div>
                      {hasNominated && (
                        <div className="mt-1">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                              hasNominated.status === 'APPROVED'
                                ? 'bg-green-100 text-green-800'
                                : hasNominated.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {hasNominated.status || 'PENDING'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      {hasNominated ? (
                        <Button
                          variant="secondary"
                          onClick={() => setElection(e)}
                        >
                          View Details
                        </Button>
                      ) : (
                        <Button
                          variant={open ? 'primary' : 'secondary'}
                          disabled={!open}
                          onClick={() => handleNominateClick(e)}
                        >
                          {open ? 'Nominate' : 'Closed'}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            {(!allElections ||
              allElections.filter((e) => {
                const now = Date.now();
                const ns = new Date(e.nomination_start).getTime();
                const ne = new Date(e.nomination_end).getTime();
                return now >= ns && now <= ne;
              }).length === 0) && (
              <li className="py-3 text-gray-600">No active elections found for your class.</li>
            )}
          </ul>
        </div>

        {/* After active nominations, show all elections (completed) below */}
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-semibold mb-3">Completed Class Elections</h2>
          <ul className="divide-y">
            {(allElections || [])
              .filter((e) => {
                const now = Date.now();
                const ns = new Date(e.nomination_start).getTime();
                const ne = new Date(e.nomination_end).getTime();
                return now > ne;
              })
              .map((e) => (
                <li key={e.election_id} className="py-3 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">Election #{e.election_id}</div>
                    <div className="text-gray-600">
                      Nominations: {new Date(e.nomination_start).toLocaleString()} -{' '}
                      {new Date(e.nomination_end).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <Button variant="secondary" disabled>
                      Closed
                    </Button>
                  </div>
                </li>
              ))}
            {(!allElections ||
              allElections.filter((e) => {
                const now = Date.now();
                const ns = new Date(e.nomination_start).getTime();
                const ne = new Date(e.nomination_end).getTime();
                return now > ne;
              }).length === 0) && (
              <li className="py-3 text-gray-600">No completed elections found for your class.</li>
            )}
          </ul>
        </div>

        {showPolicy && policy && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded shadow max-w-2xl w-full p-4">
              <h2 className="text-lg font-semibold mb-2">Nomination Policy</h2>
              <div className="h-64 overflow-auto border p-2 whitespace-pre-wrap text-sm mb-3">
                {policy.policy_text}
              </div>

              {speechSupported && (
                <div className="border rounded p-3 mb-3 bg-gray-50">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Speech Settings</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-sm text-gray-700">
                      Type of Person
                      <select
                        value={voiceOption}
                        onChange={(e) => setVoiceOption(e.target.value)}
                        className="mt-1 w-full border rounded px-2 py-1.5"
                      >
                        {VOICE_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-gray-700">
                      Speed: {Number(speechRate).toFixed(2)}x
                      <input
                        type="range"
                        min="0.5"
                        max="1.5"
                        step="0.05"
                        value={speechRate}
                        onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                        className="mt-1 w-full"
                      />
                    </label>
                  </div>

                  {!getPreferredVoice(voiceOption, voices) && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                      Selected voice type is not available on this browser/OS. Please install a male/female voice and refresh.
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Button
                      type="button"
                      onClick={speakNominationPolicyDeclaration}
                      disabled={isSpeaking}
                    >
                      🔊 Speak nomination policy declaration
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={stopSpeech}
                      disabled={!isSpeaking}
                    >
                      ⏹ Stop
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowPolicy(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      // Pass election_id when accepting nomination policy
                      await acceptPolicy('Nomination Policy', election?.election_id);
                      // Update the policy status map
                      setPolicyStatusByElection(prev => ({
                        ...prev,
                        [election?.election_id]: true
                      }));
                      setShowPolicy(false);
                      setMsg('Policy accepted. You can now submit your nomination.');
                    } catch (e) {
                      setErr(e.response?.data?.error || 'Failed to accept');
                      setShowPolicy(false);
                    }
                  }}
                >
                  I Accept
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
