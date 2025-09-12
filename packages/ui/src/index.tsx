import React from "react";

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button {...props} style={{ padding: "8px 12px", borderRadius: 6, background: "#0ea5e9", color: "white", border: 0 }}>
    {children}
  </button>
);

