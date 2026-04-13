import React from 'react';

export default function Lightbox({ src, onClose }) {
  return (
    <div id="lightbox" onClick={onClose}>
      <img src={src} alt="trade screenshot" />
    </div>
  );
}
