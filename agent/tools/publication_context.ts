import { defineTool } from "eve/tools";
import { z } from "zod";

import { buildPublicationContext } from "../lib/publication-context";

export default defineTool({
  description:
    "Return the current Juara Merdeka edition date in AWST/WITA, issue number, research window, and required article count.",
  inputSchema: z.object({}),
  execute() {
    return buildPublicationContext();
  },
});
