import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onLeave: () => void;
}

/**
 * Catches anything that breaks inside a game, including a game file that won't
 * load after an update or on a bad connection, so the player gets a way out
 * instead of a black screen.
 */
export class Recover extends Component<Props, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="wp-loading wp-recover" role="alert">
        <h1>That didn’t load</h1>
        <p>Check your connection, then try again.</p>
        <button type="button" className="wp-play" onClick={() => location.reload()}>
          Try again
        </button>
        <button
          type="button"
          className="wp-welcome-later"
          onClick={() => {
            this.setState({ broken: false });
            this.props.onLeave();
          }}
        >
          Back to the games
        </button>
      </div>
    );
  }
}
