import "./App.css";
import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { invoke } from "@tauri-apps/api/core";
import "xterm/css/xterm.css";

interface TerminalTab {
  id: string;
  title: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  isReading: boolean;
}

function App() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const tabCounter = useRef(1);

  const readFromPty = useCallback(async (tab: TerminalTab) => {
    if (tab.isReading) return;
    tab.isReading = true;
    
    try {
      const data = await invoke("async_read_from_pty", { tabId: tab.id }) as string;
      if (data && tab.terminal) {
        tab.terminal.write(data);
      }
    } catch (error) {
      console.error("Error reading from PTY:", error);
    }
    
    tab.isReading = false;
    setTimeout(() => readFromPty(tab), 50);
  }, []);

  const createTerminal = useCallback(() => {
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
    
    return { term, fitAddon };
  }, []);

  const addTab = useCallback(async () => {
    const { term, fitAddon } = createTerminal();
    const tabId = `tab-${tabCounter.current++}`;
    
    const newTab: TerminalTab = {
      id: tabId,
      title: `Terminal ${tabCounter.current - 1}`,
      terminal: term,
      fitAddon,
      isReading: false,
    };

    term.onData((data) => writeToPty(data, tabId));
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
    
    try {
      await invoke("async_create_shell", { tabId });
    } catch (error) {
      console.error("Error creating shell:", error);
    }
    
    return newTab;
  }, [createTerminal]);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const tabToClose = prev.find(tab => tab.id === tabId);
      if (tabToClose) {
        tabToClose.terminal.dispose();
        invoke("async_close_shell", { tabId }).catch(console.error);
      }
      
      const newTabs = prev.filter(tab => tab.id !== tabId);
      
      if (activeTabId === tabId && newTabs.length > 0) {
        setActiveTabId(newTabs[0].id);
      }
      
      return newTabs;
    });
  }, [activeTabId]);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  useEffect(() => {
    addTab();
  }, [addTab]);

  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab && terminalRef.current) {
      terminalRef.current.innerHTML = '';
      activeTab.terminal.open(terminalRef.current);
      fitTerminal(activeTab);
      readFromPty(activeTab);
    }
  }, [activeTabId, tabs, readFromPty]);

  useEffect(() => {
    const handleResize = () => {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      if (activeTab) fitTerminal(activeTab);
    };
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTabId, tabs]);

  const fitTerminal = async (tab: TerminalTab) => {
    if (tab.fitAddon && tab.terminal) {
      tab.fitAddon.fit();
      try {
        await invoke("async_resize_pty", {
          tabId: tab.id,
          rows: tab.terminal.rows,
          cols: tab.terminal.cols,
        });
      } catch (error) {
        console.error("Error resizing PTY:", error);
      }
    }
  };

  const writeToPty = async (data: string, tabId: string) => {
    try {
      await invoke("async_write_to_pty", { data, tabId });
    } catch (error) {
      console.error("Error writing to PTY:", error);
    }
  };

  return (
    <div className="app">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            <span className="tab-title">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="tab-add" onClick={addTab}>
          +
        </button>
      </div>
      <div
        id="terminal"
        ref={terminalRef}
        className="terminal-container"
      ></div>
    </div>
  );
}

export default App;
