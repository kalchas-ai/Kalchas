import { redirect } from "next/navigation";

/** The product is at /app; the root goes straight there. */
export default function Page() {
  redirect("/app");
}
