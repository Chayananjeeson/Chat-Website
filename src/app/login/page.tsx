//src/app/login/page.tsx
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-[60vh] grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-4">เข้าสู่ระบบ / สมัครสมาชิก</h1>
        <LoginForm />
      </div>
    </main>
  );
}
