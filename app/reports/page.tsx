import ReportsClient from "@/app/reports/reports-client";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <main className="page-shell reports-page">
      <ReportsClient />
    </main>
  );
}
