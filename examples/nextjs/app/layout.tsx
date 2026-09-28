import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          defer
          src="https://track.satsu.pro/tracker.js"
          data-site="YOUR_ID"
        />
      </body>
    </html>
  );
}
