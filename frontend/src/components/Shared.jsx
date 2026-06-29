import React from 'react';

export function SectionHeading({ eyebrow, title, sub }) {
  return (
    <div className="aa-section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}
