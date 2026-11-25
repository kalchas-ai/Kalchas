import type { Metadata } from "next";
import { ProductRoot } from "@/components/product/shell";

export const metadata: Metadata = { title: "Kalchas" };

/** The product: replay and prediction, on the engine and the local database. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProductRoot>{children}</ProductRoot>;
}
