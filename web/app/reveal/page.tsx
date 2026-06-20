// Server wrapper: opt this route out of static prerendering. The view is a
// client component that uses the wallet kit (browser-only APIs like
// localStorage) and submits transactions, so it must render dynamically.
export const dynamic = "force-dynamic";

import View from "./View";

export default function Page() {
  return <View />;
}
