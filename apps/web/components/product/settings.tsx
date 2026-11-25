"use client";

import { SettingsPage } from "@/components/flow-lab/rest";

/** The settings, as a page of their own. */
export default function Settings() {
  return (
    <div className="fixed inset-x-0 top-12 bottom-0">
      <SettingsPage />
    </div>
  );
}
