import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ARBITRUM_SEPOLIA_EXPLORER_URL } from '../config/chains';

const explorerOrigin = new URL(ARBITRUM_SEPOLIA_EXPLORER_URL).origin;

function safeUrlTransform(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin || parsed.origin === explorerOrigin) return parsed.href;
  } catch {
    return '';
  }
  return '';
}

export default function SafeMarkdown({ children }) {
  const content = typeof children === 'string' && children.trim()
    ? children
    : 'I could not generate a response. Please try again.';

  return (
    <ReactMarkdown
      skipHtml
      urlTransform={safeUrlTransform}
      components={{
        a: ({ children: linkText, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer">{linkText}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

