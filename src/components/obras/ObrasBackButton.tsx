"use client";

import React from "react";
import Link from "next/link";

interface ObrasBackButtonProps {
  href?: string;
  label?: string;
}

export default function ObrasBackButton({
  href = "/obras",
  label = "Voltar",
}: ObrasBackButtonProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900 font-bold text-xs shadow-2xs transition-all active:scale-95"
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
