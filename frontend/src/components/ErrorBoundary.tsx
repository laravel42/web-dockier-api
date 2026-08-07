import React from "react";
import Alert from "./ui/Alert";
import Button from "./ui/Button";

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; title?: string },
  State
> {
  constructor(props: { children: React.ReactNode; title?: string }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "An unexpected error occurred." };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-lg">
          <Alert variant="error" className="mb-4">
            <p className="font-medium">{this.props.title ?? "Something went wrong"}</p>
            <p className="mt-1 opacity-90">{this.state.message}</p>
          </Alert>
          <Button
            variant="primary"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
