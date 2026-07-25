/**
 * Generic fixture flow probe.  It intentionally has no repository-, fixture-,
 * class-, method-, or caller-specific selector.  Results are evidence only;
 * a relationship provider must still reject ambiguous or wrong-target rows.
 */
import python
import semmle.python.dataflow.new.DataFlow

module FixtureFlowConfig implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node node) { any() }
  predicate isSink(DataFlow::Node node) {
    exists(DataFlow::MethodCallNode call | node = call.getFunction())
  }
  int accessPathLimit() { result = 5 }
}

module FixtureFlow = DataFlow::Global<FixtureFlowConfig>;

from DataFlow::Node source, DataFlow::MethodCallNode sink
where
  FixtureFlow::flow(source, sink.getFunction()) and
  (
    source.getLocation().getStartLine() != sink.getLocation().getStartLine() or
    source.getLocation().getStartColumn() != sink.getLocation().getStartColumn()
  )
select
  sink.getMethodName(),
  sink.getEnclosingCallable().getQualifiedName(),
  sink.getLocation(),
  sink.getLocation().getFile().getRelativePath(),
  sink.getLocation().getStartLine(),
  sink.getLocation().getStartColumn(),
  sink.getLocation().getEndLine(),
  sink.getLocation().getEndColumn(),
  source.toString(),
  source.getLocation(),
  source.getLocation().getFile().getRelativePath(),
  source.getLocation().getStartLine(),
  source.getLocation().getStartColumn()
