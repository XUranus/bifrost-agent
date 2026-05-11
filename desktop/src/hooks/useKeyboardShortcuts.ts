import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          navigate("/assets/new");
          break;
        case ",":
          e.preventDefault();
          navigate("/settings");
          break;
        case "1":
          e.preventDefault();
          navigate("/");
          break;
        case "2":
          e.preventDefault();
          navigate("/assets");
          break;
        case "3":
          e.preventDefault();
          navigate("/jobs");
          break;
        case "4":
          e.preventDefault();
          navigate("/sla-policies");
          break;
        case "5":
          e.preventDefault();
          navigate("/settings");
          break;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [navigate]);
}
