import React from 'react';

export default function Toast({ msg, type, visible }) {
  return (
    <div className={`toast ${type}${visible ? '' : ' hidden'}`}>{msg}</div>
  );
}
