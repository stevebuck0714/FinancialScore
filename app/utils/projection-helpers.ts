interface ProjectionDefaults {
  bestCaseRev: number;
  bestCaseExp: number;
  worstCaseRev: number;
  worstCaseExp: number;
}

export const saveProjectionDefaults = (
  bestCaseRevMultiplier: number,
  bestCaseExpMultiplier: number,
  worstCaseRevMultiplier: number,
  worstCaseExpMultiplier: number,
  setDefaultBestCaseRevMult: (val: number) => void,
  setDefaultBestCaseExpMult: (val: number) => void,
  setDefaultWorstCaseRevMult: (val: number) => void,
  setDefaultWorstCaseExpMult: (val: number) => void,
  setShowDefaultSettings: (val: boolean) => void
) => {
  const defaults: ProjectionDefaults = {
    bestCaseRev: bestCaseRevMultiplier,
    bestCaseExp: bestCaseExpMultiplier,
    worstCaseRev: worstCaseRevMultiplier,
    worstCaseExp: worstCaseExpMultiplier
  };
  localStorage.setItem('fs_projectionDefaults', JSON.stringify(defaults));
  setDefaultBestCaseRevMult(bestCaseRevMultiplier);
  setDefaultBestCaseExpMult(bestCaseExpMultiplier);
  setDefaultWorstCaseRevMult(worstCaseRevMultiplier);
  setDefaultWorstCaseExpMult(worstCaseExpMultiplier);
  alert('Defaults saved successfully!');
  setShowDefaultSettings(false);
};

