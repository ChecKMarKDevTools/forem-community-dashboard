import { Dashboard } from "@/components/Dashboard";

export const metadata = {
  title: "DEV Community Dashboard",
  description:
    "Monitor and support community conversations with behavioral scoring and moderation insights.",
};

export default function Home() {
  return (
    <main className="min-h-screen">
      <Dashboard />
    </main>
  );
}
