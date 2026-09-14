import "./Workspace.css";
import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Launcher } from "./components/Launcher";
import { Room } from "./components/Room";
import { Review } from "./components/Review";
import { Terminal } from "./components/Terminal";
import { Environment } from "./components/Environment";
import { Ide } from "./components/Ide";
import { TaskBoard } from "./components/TaskBoard";
import { ChatBoard } from "./components/ChatBoard";
import { MeetingRoom } from "./components/MeetingRoom";
import { DebateRoom } from "./components/DebateRoom";
import { PlanningBoard } from "./components/PlanningBoard";
import { AdminPanel } from "./components/AdminPanel";
import { OfficeFloor } from "./components/OfficeFloor";
import { ProjectWorkflows } from "./components/ProjectWorkflows";
import { NewAgentModal } from "./components/NewAgentModal";
import { ArtifactTabs } from "./components/ArtifactTabs";

export function App() {
  const projectId = useStore((s) => s.selectedProjectId);
  const view = useStore((s) => s.view);
  const init = useStore((s) => s.init);
  const showView = useStore.getState().showView;
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { void init(); }, [init]);

  return (
    <>
      {view === "launcher" && <Launcher onNewAgent={() => setModalOpen(true)} />}
      {view === "room" && <Room key={projectId} onAddAgent={() => setModalOpen(true)} onOpenReview={() => showView("review")} />}
      {view === "review" && <Review key={projectId} />}
      {view === "terminal" && <Terminal key={projectId} />}
      {view === "env" && <Environment key={projectId} />}
      {view === "ide" && <Ide key={projectId} />}
      {view === "board" && <TaskBoard key={projectId} />}
      {view === "chat" && <ChatBoard key={projectId} />}
      {view === "meeting" && <MeetingRoom key={projectId} />}
      {view === "debate" && <DebateRoom key={projectId} />}
      {view === "planning" && <PlanningBoard key={projectId} />}
      {view === "admin" && <AdminPanel />}
      {view === "floor" && <OfficeFloor key={projectId} />}
      {view === "workflows" && <ProjectWorkflows key={projectId} />}
      {modalOpen && <NewAgentModal onClose={() => setModalOpen(false)} />}
      <ArtifactTabs />
    </>
  );
}
