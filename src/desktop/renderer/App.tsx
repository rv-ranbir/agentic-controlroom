import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Launcher } from "./components/Launcher";
import { Room } from "./components/Room";
import { Review } from "./components/Review";
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
      {modalOpen && <NewAgentModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
