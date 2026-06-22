type ErrorBannerProps = {
  message: string;
};

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="rounded border border-amber-600/50 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
      {message}
    </div>
  );
}
