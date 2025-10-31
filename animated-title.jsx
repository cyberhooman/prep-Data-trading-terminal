function Title() {
  return (
    <h1 className="text-3xl font-semibold text-slate-100 tracking-wide">
      ALPHALABS DATA TRADING
    </h1>
  );
}

// Mount immediately when loaded
const root = ReactDOM.createRoot(document.getElementById('animated-title-root'));
root.render(<Title />);
