import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

type State =
    | {
          hasError: true;
          error: Error;
      }
    | {
          hasError: false;
          error: null;
      };

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    override render() {
        if (this.state.hasError) {
            return (
                <box
                    style={{
                        width: "100%",
                        height: "100%",
                        border: true,
                        borderColor: "red",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <text>Something went wrong!</text>
                    <text>{this.state.error.message}</text>
                    <text>{this.state.error.stack}</text>
                    <text>Press Ctrl+C to exit</text>
                </box>
            );
        }

        return this.props.children;
    }
}
