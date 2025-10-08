import SetUsernameForm from "@/components/SetUsernameForm";

export default function SetupUsernamePage() {
  return (
    <main className="min-h-[60vh] grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-4">ตั้งชื่อผู้ใช้</h1>
        <SetUsernameForm />
      </div>
    </main>
  );
}
