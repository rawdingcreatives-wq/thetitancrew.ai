// @ts-nocheck
/**
 * TitanCrew · Root Page
 *
 * Shows the landing page for visitors, redirects authenticated
 * users to /home (the dashboard).
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LandingPage from "./(public)/landing/page";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/home");
  }

  return <LandingPage />;
}
