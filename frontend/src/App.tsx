import { Route, Routes } from "react-router-dom";

import Layout from "@/components/Layout";
import SessionsPage from "@/pages/sessions";
import SessionDetailPage from "@/pages/session-detail";
import NewSessionPage from "@/pages/new-session";
import TopicDetailPage from "@/pages/topic-detail";
import NotFound from "@/pages/404";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SessionsPage />} />
        <Route path="/new" element={<NewSessionPage />} />
        <Route path="/session/:sessionId" element={<SessionDetailPage />} />
        <Route path="/topic/:topicId" element={<TopicDetailPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
