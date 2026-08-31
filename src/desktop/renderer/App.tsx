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
import { NewAgentModal } from "./components/NewAgentModal";

export function App() {
  const view = useStore((s) => s.view);
  const init = useStore((s) => s.init);
  const showView = useStore.getState().showView;
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { void init(); }, [init]);

  return (
    <>
      {view === "launcher" && <Launcher onNewAgent={() => setModalOpen(true)} />}
      {view === "room" && <Room onAddAgent={() => setModalOpen(true)} onOpenReview={() => showView("review")} />}
      {view === "review" && <Review />}
      {view === "terminal" && <Terminal />}
      {view === "env" && <Environment />}
      {view === "ide" && <Ide />}
      {view === "board" && <TaskBoard />}
      {view === "chat" && <ChatBoard />}
      {view === "meeting" && <MeetingRoom />}
      {view === "debate" && <DebateRoom />}
      {view === "planning" && <PlanningBoard />}
      {view === "admin" && <AdminPanel />}
      {view === "floor" && <OfficeFloor />}
      {modalOpen && <NewAgentModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
