export const metadata = {
  title: 'Upload Dashboard',
  description: 'Monitoreo de subidas a Google Drive',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f4f5f7' }}>
        {children}
      </body>
    </html>
  );
}
