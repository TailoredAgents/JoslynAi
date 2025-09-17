'use client';

import { createContext, useContext, useState } from "react";

type DiffContextValue = {
  acknowledged: boolean;
  markReviewed: () => void;
};

const DiffContext = createContext<DiffContextValue>({ acknowledged: false, markReviewed: () => {} });

export function useDiffContext() {
  return useContext(DiffContext);
}

export function DiffProvider({ children }: { children: React.ReactNode }) {
  const [ack, setAck] = useState(false);
  return (
    <DiffContext.Provider value={{ acknowledged: ack, markReviewed: () => setAck(true) }}>
      {children}
    </DiffContext.Provider>
  );
}
