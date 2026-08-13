import { defineTool } from "eve/tools";
import { z } from "zod";

import { buildPublicationContext } from "../lib/publication-context";

export default defineTool({
  description:
    "Return the current Juara Merdeka morning-edition context in AWST/WITA: kind hari_ini, printed date, issue number, 36-hour research window, and required article count. Do not use this for the Kemarin sheet.",
  inputSchema: z.object({}),
  execute() {
    return buildPublicationContext();
  },
});
