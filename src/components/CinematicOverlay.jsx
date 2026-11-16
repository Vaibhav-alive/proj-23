import SlideButton from './SlideButton';
import './CinematicOverlay.css';
const today = new Date()
const day = String(today.getDate()).padStart(2, '0');
const month = String(today.getMonth() + 1).padStart(2, '0');
const year = today.getFullYear();

const formattedDate = `${day}/${month}/${year}`;

export default function CinematicOverlay({
  activeScene = null, // 'cake' | 'candy-mid'
  visible = true,
  disabled = false,
  inert = false,
  onNext,
}) {
  const isVisible = visible && activeScene !== null;
  const isButtonDisabled = disabled || !isVisible;

  return (
    <div
      className={`cinematic-overlay-root ${isVisible ? 'is-active' : 'is-hidden'}`}
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'opacity 0.4s ease',
      }}
      aria-hidden={!isVisible}
      inert={inert}
    >

      <header className="overlay-header">
        <div className="header-brand-side">
          <div className="header-cd-circle">DM</div>
          <span className="header-brand-title"></span>
        </div>

        <div className="header-tagline-side">
          <span className="header-tagline-text">{formattedDate}</span>
        </div>
        {activeScene === 'cake' && (
          <span className="mobile-date-pill">{formattedDate}</span>
        )}
      </header>


      {activeScene === 'cake' && (
        <section className="scene-container scene-frame-3">
          <div className="scene-3-content">
            

            <h1 className="main-display-heading">dumy-heading</h1>

            

            <div className="action-buttons-row action-buttons-row--split">
              

              <SlideButton
                key="cake"
                label="SLIDE TO CONTINUE"
                disabled={isButtonDisabled}
                onCommit={onNext}
              />
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
          SCENE 1b: CANDY MID STOP (Frame 83)
         ==================================================================== */}
      {activeScene === 'candy-mid' && (
        <section className="scene-container scene-frame-candy-mid">
          <h2 className="main-display-heading main-display-heading--center">dumy-heading</h2>
          <div className="action-buttons-row action-buttons-row--center candy-mid-btn">
            <SlideButton
              key="candy-mid"
              label="SLIDE TO CONTINUE"
              disabled={isButtonDisabled}
              onCommit={onNext}
            />
          </div>
        </section>
      )}

    </div>
  );
}
