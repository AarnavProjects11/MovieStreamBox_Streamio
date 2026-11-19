import { createFileRoute } from "@tanstack/react-router";
import { MyStreams } from "@/components/my-streams";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My Streams · Stream Box" },
      {
        name: "description",
        content: "Your personal cloud video library — torrents, direct links and 4KHDHub titles.",
      },
      { property: "og:title", content: "My Streams · Stream Box" },
      {
        property: "og:description",
        content: "Your personal cloud video library — torrents, direct links and 4KHDHub titles.",
      },
    ],
  }),
  component: MyStreams,
});
