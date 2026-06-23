import { redirect } from "next/navigation";

// The app starts at the Day view; middleware sends logged-out users to /login.
export default function Home() {
  redirect("/today");
}
