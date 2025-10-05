import "./App.css";
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { invoke } from "@tauri-apps/api/core";
import "xterm/css/xterm.css";

function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isReadingRef = useRef(false);

  const readFromPty = useCallback(async () => {
    if (isReadingRef.current) return;
    isReadingRef.current = true;
    
    try {
      const data = await invoke("async_read_from_pty") as string;
      if (data && terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data);
      }
    } catch (error) {
      console.error("Error reading from PTY:", error);
    }
    
    isReadingRef.current = false;
    setTimeout(readFromPty, 50);
  }, []);

  useEffect(() => {
    const initTerminal = async () => {
      const term = new Terminal({
        fontFamily: "'MesloLGS NF', 'JetBrainsMono Nerd Font', 'Hack Nerd Font', 'FiraCode Nerd Font', monospace",
        fontSize: 15,
        lineHeight: 1.15,
        letterSpacing: -0.2,
        cursorStyle: "block",
        cursorBlink: true,
        theme: {
          background: "#0d1117",
          foreground: "#c9d1d9",
          cursor: "#79c0ff",
          cursorAccent: "#0d1117",
          selectionBackground: "#264f78",
          black: "#484f58",
          red: "#ff7b72",
          green: "#7ee83f",
          yellow: "#f9e2af",
          blue: "#79c0ff",
          magenta: "#d2a8ff",
          cyan: "#56d4dd",
          white: "#e6edf3",
          brightBlack: "#6e7681",
          brightRed: "#ffa198",
          brightGreen: "#56d364",
          brightYellow: "#e3b341",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#56d4dd",
          brightWhite: "#f0f6fc",
        },
        allowTransparency: false,
        convertEol: true,
        scrollback: 10000,
        tabStopWidth: 4,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      if (terminalRef.current) {
        term.open(terminalRef.current);
        terminalInstanceRef.current = term;
        fitAddonRef.current = fitAddon;
        
        term.onData(writeToPty);
        
        await initShell();
        fitTerminal();
        readFromPty();
      }
    };

    initTerminal();

    const handleResize = () => fitTerminal();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
      }
    };
  }, [readFromPty]);

  const fitTerminal = async () => {
    if (fitAddonRef.current && terminalInstanceRef.current) {
      fitAddonRef.current.fit();
      try {
        await invoke("async_resize_pty", {
          rows: terminalInstanceRef.current.rows,
          cols: terminalInstanceRef.current.cols,
        });
      } catch (error) {
        console.error("Error resizing PTY:", error);
      }
    }
  };

  const writeToPty = async (data: string) => {
    try {
      await invoke("async_write_to_pty", { data });
    } catch (error) {
      console.error("Error writing to PTY:", error);
    }
  };

  const initShell = async () => {
    try {
      await invoke("async_create_shell");
    } catch (error) {
      console.error("Error creating shell:", error);
    }
  };

  return (
    <div className="app">
      <div
        id="terminal"
        ref={terminalRef}
        className="terminal-container"
      ></div>
    </div>
  );
}

export default App;
