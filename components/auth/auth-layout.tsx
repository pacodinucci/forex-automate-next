import Link from "next/link";

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="bg-muted min-h-svh flex flex-col justify-center items-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium"
        >
          <div className="text-xl font-semibold tracking-tight">
            Forex <span className="font-bold">Automate</span>
          </div>
        </Link>
        {children}
      </div>
    </div>
  );
};
