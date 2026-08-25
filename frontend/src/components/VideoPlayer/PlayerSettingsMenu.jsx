import SpeedPanel from "./SpeedPanel";
import MainSettingsPanel from "./MainSettingsPanel";

/**
 * Menu impostazioni del player: due schermate (elenco e "finestrina" della
 * velocità), una sola alla volta, come nel menu di YouTube. Puramente
 * presentazionale — stato e callback restano nel VideoPlayer, qui arrivano
 * solo come props.
 */
export default function PlayerSettingsMenu(props) {
  const { settingsPage, onBack, onSpeedChange, speed, onClose } = props;
  return (
    <>
      <div className="player-settings-backdrop" onClick={onClose} />
      <div className="player-settings-menu">
        {settingsPage === "speed"
          ? <SpeedPanel speed={speed} onSpeedChange={onSpeedChange} onBack={onBack} />
          : <MainSettingsPanel {...props} />}
      </div>
    </>
  );
}
