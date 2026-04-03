import React from 'react';

/*
 * STYLES
 *
 * Purpose:
 * Provide a small map of visual style class names keyed by alert kind. Each
 * entry is a string of Tailwind-style utility classes used to style the alert's
 * background, text and border.
 *
 * Parameters:
 * None — this is a static object used by the component below.
 *
 * Return value:
 * The object itself is exported within this module scope and looked up by the
 * `Alert` component when rendering.
 */
const STYLES = {
  // Style for informational alerts
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  // Style for success alerts (green)
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  // Style for winner alerts (red)
  winner: 'bg-rose-50 text-rose-900 border-rose-300',
  // Style for warning alerts (yellow)
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  // Style for danger alerts (red)
  danger: 'bg-red-50 text-red-800 border-red-200',
};


/*
 * Alert
 *
 * Purpose:
 * Render a small, reusable alert box with optional title and body content. The
 * component selects visual styles and a colored left border based on the
 * `kind` prop. It is intentionally simple and purely presentational.
 *
 * Parameters:
 * - kind (string): visual variant of the alert; defaults to 'info'. Expected
 *   values include 'info', 'success', 'warning', and 'danger'.
 * - title (node|string): optional title rendered above the alert body.
 * - children (node): the body/content to display inside the alert.
 * - className (string): optional additional class names applied to the root
 *   element for further customization.
 *
 * Return value:
 * Returns a React element representing the alert box.
 */
export default function Alert({ kind = 'info', title, children, className = '' }) {
  // Map `kind` to a utility class used for the thick colored left border.
  // Falls back to the 'info' left-bar color when an unknown kind is provided.
  const leftBar =
    {
      info: 'border-l-blue-400',
      success: 'border-l-emerald-400',
      winner: 'border-l-rose-500',
      warning: 'border-l-yellow-400',
      danger: 'border-l-red-400',
    }[kind] || 'border-l-blue-400';

  /*
   * Build the className for the root element by composing base classes with
   * the variant-specific classes from STYLES, any user-provided classes, and
   * the computed leftBar class. This keeps the component flexible and
   * easy to override from the outside.
   */
  return (
    <div
      className={`relative border ${STYLES[kind]} ${className} rounded-lg p-3 pl-4 border-l-4 ${leftBar} transition`}
    >
      {/* If a title exists, render it using slightly stronger weight to make it stand out */}
      {title && <div className="font-semibold mb-1">{title}</div>}

      {/* The main alert content is rendered here. It accepts any valid React node. */}
      <div className="text-sm">{children}</div>
    </div>
  );
}
