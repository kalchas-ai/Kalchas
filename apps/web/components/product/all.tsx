"use client";

import { Projects } from "@/components/flow-lab/rest";
import { useHomeData } from "./start/shared";

/** All projects, as a page of its own: the same list that is laid over the home page in the settled design. */
export default function All() {
  const home = useHomeData();
  return (
    <div className="fixed inset-x-0 top-12 bottom-0">
      <Projects home={home} />
    </div>
  );
}
