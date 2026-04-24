'use client';

import { motion } from 'framer-motion';

export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;

  const displayText =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      className="flex items-center gap-1.5 px-4 py-2"
    >
      <div className="flex gap-0.5">
        <motion.span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full"
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
        />
        <motion.span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full"
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, delay: 0.15 }}
        />
        <motion.span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full"
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 0.6, delay: 0.3 }}
        />
      </div>
      <span className="text-xs text-gray-400">{displayText}</span>
    </motion.div>
  );
}
