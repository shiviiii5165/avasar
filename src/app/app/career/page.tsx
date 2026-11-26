import { permanentRedirect } from "next/navigation";

/** Career intelligence now lives on Home (/app). Old links and bookmarks land there. */
export default function CareerPage() {
  permanentRedirect("/app");
}
