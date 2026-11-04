import { createContext, useContext, useRef, useState, type Dispatch, type SetStateAction, type ReactNode, type RefObject } from 'react'

type TodoAction = { open: () => void } | null
const Context = createContext<{
  available: boolean; setAvailable: Dispatch<SetStateAction<boolean>>;
  todo: TodoAction; setTodo: Dispatch<SetStateAction<TodoAction>>; trigger: RefObject<HTMLButtonElement | null>
} | null>(null)

/** Presentation-only bridge: the current page retains ownership of its session and draft actions. */
export function WorkspaceQuickToolsProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false)
  const [todo, setTodo] = useState<TodoAction>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  return <Context.Provider value={{ available, setAvailable, todo, setTodo, trigger }}>{children}</Context.Provider>
}
export const useWorkspaceQuickTools = () => useContext(Context)
