/*
 * Page: Vote
 *
 * Allows students to cast their vote in active class elections, view candidates, and accept voting policy.
 *
 * Features:
 *   - Fetches active election and approved candidates
 *   - Handles voting token and submission
 *   - Displays policy and error/success messages
 *
 * Usage:
 *   Rendered as part of the student dashboard routes.
 */

import React, { useEffect, useRef, useState } from 'react';
import Navbar from '../../components/Navbar';
import { getMyActiveElection } from '../../api/electionApi';
import { listApprovedByElection } from '../../api/nominationApi';
import { getVoteToken, castVote, checkVoteStatus } from '../../api/voteApi';
import { getPolicy, acceptPolicy, getPolicyStatus } from '../../api/policyApi';

const toDirectImageUrl = (url) => {
  try {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';

    let m = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    m = trimmed.match(/[?&]id=([^&]+)/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    return trimmed;
  } catch {
    return '';
  }
};

const buildAvatarFallback = (name) => {
  const safeName = encodeURIComponent((name || 'Candidate').trim() || 'Candidate');
  return `https://ui-avatars.com/api/?name=${safeName}&background=e5e7eb&color=374151&size=128`;
};

const resolveCandidatePhoto = (candidate) => {
  const rawPhoto =
    candidate?.photo_url ||
    candidate?.photoUrl ||
    candidate?.image_url ||
    candidate?.imageUrl ||
    candidate?.avatar_url ||
    candidate?.avatarUrl ||
    candidate?.student_photo_url ||
    candidate?.profile_photo_url ||
    '';

  return toDirectImageUrl(rawPhoto) || buildAvatarFallback(candidate?.name);
};

const VOICE_OPTIONS = [
  { id: 'FEMALE', label: 'Female' },
  { id: 'MALE', label: 'Male' },
];

export default function VotePage() {
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [votingNotStarted, setVotingNotStarted] = useState(false);
  const [votingEnded, setVotingEnded] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingCandidateId, setSpeakingCandidateId] = useState('');
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
    setSpeakingCandidateId('');
  };

  const speakText = (text, candidateId = '') => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setSpeechSupported(false);
      setErr('Speech is not supported in this browser.');
      return;
    }

    stopSpeech();
    stopRequestedRef.current = false;
    setErr('');

    const liveVoices = window.speechSynthesis.getVoices() || voices || [];
    const selectedVoice = getPreferredVoice(voiceOption, liveVoices);
    const utterance = new window.SpeechSynthesisUtterance(text);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    utterance.rate = Number(speechRate) || 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpeakingCandidateId(candidateId || 'ALL');
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingCandidateId('');
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingCandidateId('');
      utteranceRef.current = null;
      if (stopRequestedRef.current) return;
      setErr('Failed to play speech. Please try again.');
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const speakAllNominees = () => {
    if (!candidates.length) {
      setErr('No nominees available to speak.');
      return;
    }

    const details = candidates
      .map((c, idx) => {
        const manifesto = (c.manifesto || '').trim();
        const cleanManifesto = manifesto ? manifesto.replace(/\s+/g, ' ') : 'No manifesto provided.';
        return `Nominee ${idx + 1}. Name: ${c.name}. Student ID: ${c.student_id}. Manifesto: ${cleanManifesto}.`;
      })
      .join(' ');

    speakText(`Nominee details for this election. ${details}`, 'ALL');
  };

  const speakSingleNominee = (candidate) => {
    const manifesto = (candidate?.manifesto || '').trim();
    const cleanManifesto = manifesto ? manifesto.replace(/\s+/g, ' ') : 'No manifesto provided.';
    const text = `Name: ${candidate?.name}. Student ID: ${candidate?.student_id}. Manifesto: ${cleanManifesto}.`;
    speakText(text, candidate?.student_id || '');
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

  const speakVotingPolicyDeclaration = () => {
    if (!policy?.policy_text) {
      setErr('Voting policy text is not available to speak.');
      return;
    }
    const cleanPolicy = String(policy.policy_text).replace(/\s+/g, ' ').trim();
    const declaration = `Voting policy declaration. Please listen carefully before accepting. ${cleanPolicy}`;
    speakText(declaration, 'POLICY');
  };

  useEffect(() => {
    (async () => {
      try {
        const e = await getMyActiveElection();
        setElection(e);

        // Check if voting window is active
        const now = new Date();
        const voteStart = new Date(e.voting_start);
        const voteEnd = new Date(e.voting_end);

        if (now < voteStart) {
          // Voting hasn't started yet
          setVotingNotStarted(true);
          setCheckingStatus(false);
          return;
        }

        if (now > voteEnd) {
          // Voting has ended
          setVotingEnded(true);
          setCheckingStatus(false);
          return;
        }

        // Check if user has already voted FIRST (before fetching candidates)
        try {
          const voteStatus = await checkVoteStatus(e.election_id);
          if (voteStatus.has_voted) {
            setAlreadyVoted(true);
            setCheckingStatus(false);
            return;
          }
        } catch (error) {
          console.warn('Failed to check vote status:', error);
        }

        // Fetch candidates with manifesto
        const list = await listApprovedByElection(e.election_id);
        setCandidates(
          (list || []).map((c) => ({
            ...c,
            photo_url: resolveCandidatePhoto(c),
            manifesto: c?.manifesto || c?.Manifesto || '',
          }))
        );

        try {
          const p = await getPolicy('Voting Policy');
          setPolicy(p);
          // Pre-check acceptance for this election (or global)
          const status = await getPolicyStatus('Voting Policy', e.election_id);
          setAccepted(!!status?.accepted);
        } catch {}
      } catch (error) {
        setErr(error.response?.data?.error || 'No active election');
      } finally {
        setCheckingStatus(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const supported = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
    setSpeechSupported(supported);
    if (!supported) return undefined;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices() || [];
      const englishVoices = allVoices.filter((v) => String(v.lang || '').toLowerCase().startsWith('en'));
      const usableVoices = englishVoices.length ? englishVoices : allVoices;
      setVoices(usableVoices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      stopSpeech();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const getToken = async () => {
    try {
      if (!election) return;

      // First, check if the student has already voted by attempting token issuance.
      // This endpoint returns { status: 'already_voted' } without requiring policy acceptance.
      const res = await getVoteToken(election.election_id);

      // Check if response indicates already voted
      if (res.status === 'already_voted') {
        setAlreadyVoted(true);
        setErr('You have already cast your vote for this election.');
        return;
      }

      // If not already voted and policy not accepted yet, prompt for policy before using token.
      if (policy && !accepted) {
        setShowPolicy(true);
        // Don't reveal or store the token until policy is accepted
        return;
      }

      setToken(res.token);
      setMsg('Token issued. You can now cast your vote.');
    } catch (e) {
      const apiErr = e.response?.data?.error || 'Failed to get token';
      setErr(apiErr);
      if (apiErr.toLowerCase().includes('already voted')) {
        setAlreadyVoted(true);
      }
    }
  };

  const vote = async () => {
    setErr('');
    setMsg('');
    setLoading(true);
    try {
      if (!election || !selectedCandidateId || !token) {
        setErr('Please select a candidate and obtain a token.');
        return;
      }

      const res = await castVote({
        token,
        candidate_id: selectedCandidateId,
        election_id: election.election_id,
      });

      setMsg(res?.message || 'Your vote was recorded successfully');
      setToken('');
      setSelectedCandidateId('');
      setAlreadyVoted(true);
    } catch (e) {
      const apiErr = e.response?.data?.error || 'Failed to cast vote';
      setErr(apiErr);
      if (apiErr.toLowerCase().includes('already voted')) {
        setAlreadyVoted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center text-gray-600">Loading election status...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-4">Vote</h1>

        {/* Error and Success Messages */}
        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {err}
          </div>
        )}
        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {msg}
          </div>
        )}

        {/* Voting Not Started */}
        {votingNotStarted && election && (
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⏰</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Voting Window Not Started</h2>
              <p className="text-gray-600 mb-4">
                The voting period has not begun yet. Please come back during the voting window.
              </p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Election Details:</h3>
              <div className="space-y-2 text-sm text-blue-800">
                <p>
                  <span className="font-medium">Election ID:</span> {election.election_id}
                </p>
                <p>
                  <span className="font-medium">Voting Starts:</span>{' '}
                  {new Date(election.voting_start).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </p>
                <p>
                  <span className="font-medium">Voting Ends:</span>{' '}
                  {new Date(election.voting_end).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Voting Ended */}
        {votingEnded && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Voting Period Ended</h2>
            <p className="text-gray-600">
              The voting period for this election has ended. Results will be published soon.
            </p>
          </div>
        )}

        {/* Already Voted Message */}
        {alreadyVoted && (
          <div className="bg-indigo-50 border-2 border-indigo-300 rounded-lg p-6 text-center">
            <svg
              className="mx-auto h-12 w-12 text-indigo-600 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-indigo-900 mb-2">
              You have already cast your vote for this election
            </h2>
            <p className="text-indigo-700">
              Thank you for participating in the democratic process!
            </p>
          </div>
        )}

        {/* Election Info and Get Token Button */}
        {!alreadyVoted && !votingNotStarted && !votingEnded && election && (
          <div className="bg-white p-4 rounded shadow mb-6">
            <div className="mb-3">
              <strong className="text-gray-700">Election ID:</strong>{' '}
              <span className="text-gray-900">{election.election_id}</span>
            </div>
            <button
              onClick={getToken}
              disabled={!!token}
              className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {token ? 'Token Issued' : 'Get Token'}
            </button>
          </div>
        )}

        {/* Candidate List - Simplified Radio Button UI */}
        {!alreadyVoted && !votingNotStarted && !votingEnded && token && candidates.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h2 className="text-xl font-semibold text-gray-800">Select Your Candidate</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={speakAllNominees}
                  disabled={!speechSupported || isSpeaking}
                  className="px-3 py-2 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔊 Speak all nominees
                </button>
                <button
                  type="button"
                  onClick={stopSpeech}
                  disabled={!speechSupported || !isSpeaking}
                  className="px-3 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⏹ Stop
                </button>
              </div>
            </div>

            {speechSupported && (
              <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Speech Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              </div>
            )}

            {!speechSupported && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded text-sm">
                Web Speech API is not supported in this browser.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {candidates.map((c) => (
                <div
                  key={c.student_id}
                  className={`bg-white border-2 rounded-2xl p-5 transition-all ${
                    selectedCandidateId === c.student_id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <label htmlFor={`candidate-${c.student_id}`} className="block cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xl font-semibold text-gray-900">{c.name}</div>
                        <p className="text-sm text-gray-500">Candidate ID: {c.student_id}</p>
                      </div>

                      <input
                        type="radio"
                        id={`candidate-${c.student_id}`}
                        name="candidate"
                        value={c.student_id}
                        checked={selectedCandidateId === c.student_id}
                        onChange={() => setSelectedCandidateId(c.student_id)}
                        className="mt-1 h-5 w-5 text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                      <img
                        src={c.photo_url}
                        alt={c.name}
                        className="h-56 w-full object-cover sm:h-64"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = buildAvatarFallback(c.name);
                        }}
                      />
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Student ID
                        </span>
                        <span className="font-medium text-gray-900">{c.student_id}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Candidate Description
                        </span>
                        <p className="leading-relaxed text-gray-700">
                          {c.manifesto || 'No manifesto provided.'}
                        </p>
                      </div>
                    </div>
                  </label>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => speakSingleNominee(c)}
                      disabled={!speechSupported || isSpeaking}
                      className="text-sm px-3 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {speakingCandidateId === c.student_id ? '🔊 Speaking...' : '🔊 Speak details'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Vote Button */}
        {!alreadyVoted && !votingNotStarted && !votingEnded && token && (
          <div className="mt-6">
            <button
              onClick={vote}
              disabled={loading || !selectedCandidateId || !token}
              className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Vote'}
            </button>
          </div>
        )}

        {/* Policy Modal */}
        {showPolicy && policy && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded shadow max-w-2xl w-full p-6">
              <h2 className="text-lg font-semibold mb-3">Voting Policy</h2>
              <div className="h-64 overflow-auto border p-3 whitespace-pre-wrap text-sm mb-4 bg-gray-50">
                {policy.policy_text}
              </div>

              {speechSupported && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Speech Settings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                </div>
              )}

              <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={speakVotingPolicyDeclaration}
                    disabled={!speechSupported || isSpeaking}
                    className="px-3 py-2 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🔊 Speak voting policy declaration
                  </button>
                  <button
                    type="button"
                    onClick={stopSpeech}
                    disabled={!speechSupported || !isSpeaking}
                    className="px-3 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ⏹ Stop
                  </button>
                </div>

                <div className="flex gap-3">
                <button
                  onClick={() => setShowPolicy(false)}
                  className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await acceptPolicy('Voting Policy', election.election_id);
                      setAccepted(true);
                      setShowPolicy(false);
                      setMsg('Policy accepted. Please click "Get Token" again to proceed.');
                    } catch (e) {
                      setErr(e.response?.data?.error || 'Failed to accept policy');
                    }
                  }}
                  className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  I Accept
                </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
