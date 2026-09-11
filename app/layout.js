import './globals.css';
import './custom-dates.css';

export const metadata = {
  title: 'Meta Ads Report',
  description: 'A secure, client-friendly Meta campaign report.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
