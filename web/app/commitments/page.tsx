// Server wrapper: opt this route out of static prerendering. The view is a
// client component that reads live testnet data and uses the wallet kit
// (browser-only APIs like localStorage), so it must render dynamically.
export const dynamic = "force-dynamic";

import View from "./View";

export default function Page() {
  return <View />;
}
