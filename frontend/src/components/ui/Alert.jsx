const styles = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-green-200 bg-green-50 text-green-700",
};

function Alert({ type = "error", children }) {
  if (!children) return null;

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

export default Alert;

