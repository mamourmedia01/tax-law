import { Link } from "react-router-dom";
import { Mark } from "../components/Mark";

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <Mark size={56} />
      <h1 className="t-h2">We couldn't find that</h1>
      <p className="t-body text-grey-500">The page or provider you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary px-6">
        Back to home
      </Link>
    </div>
  );
}
