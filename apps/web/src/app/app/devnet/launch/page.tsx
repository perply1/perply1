"use client";

import { useCluster } from "@/components/cluster-provider";
import { useEffect } from "react";
import { LaunchWizard } from "@/components/launch-wizard";

export default function LaunchWizardPage() {
  const { setMode } = useCluster();

  useEffect(() => {
    setMode("devnet");
  }, [setMode]);

  return <LaunchWizard />;
}
