export function asyncCheck(continueCondition: () => boolean, onFinish: () => void, interval: number = 100) {
  if (continueCondition()) {
    setTimeout(() => {
      asyncCheck(continueCondition, onFinish, interval);
    }, interval);
  } else {
    onFinish();
  }
}
