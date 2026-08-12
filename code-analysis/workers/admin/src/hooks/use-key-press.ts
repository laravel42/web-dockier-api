import { useEffect } from "react";

/**
 * Custom hook to handle keyboard shortcuts
 * @param callback - Function to execute when the key combination is pressed
 * @param keyCodes - Array of key codes to listen for (e.g., ['KeyE'], ['KeyV'], ['Backspace'])
 * @param modifiers - Optional modifiers. Use metaKey: true for Cmd (Mac) or Ctrl (Windows/Linux)
 */
export function useKeyPress(
  callback: (event: KeyboardEvent) => void,
  keyCodes: string[],
  modifiers?: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Check if the pressed key is in our keyCodes array
      if (!keyCodes.includes(event.code)) {
        return;
      }

      // Check modifiers if specified
      if (modifiers) {
        // metaKey: true means Cmd (Mac) OR Ctrl (Windows/Linux)
        const metaKeyMatch =
          modifiers.metaKey === undefined ||
          (modifiers.metaKey && (event.metaKey || event.ctrlKey));

        // ctrlKey: true means specifically Ctrl key
        const ctrlKeyMatch =
          modifiers.ctrlKey === undefined ||
          event.ctrlKey === modifiers.ctrlKey;

        const shiftKeyMatch =
          modifiers.shiftKey === undefined ||
          event.shiftKey === modifiers.shiftKey;

        const altKeyMatch =
          modifiers.altKey === undefined || event.altKey === modifiers.altKey;

        if (!metaKeyMatch || !ctrlKeyMatch || !shiftKeyMatch || !altKeyMatch) {
          return;
        }
      }

      // Prevent default behavior and execute callback
      event.preventDefault();
      callback(event);
    };

    // Add event listener
    window.addEventListener("keydown", handler);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [callback, keyCodes, modifiers]);
}
