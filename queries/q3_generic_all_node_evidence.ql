/**
 * Q3 bounded generic-flow probe.
 *
 * This deliberately uses the CodeQL global value-flow relation with no
 * repository-specific source, receiver, or caller model.  The qualification
 * selector limits sinks to the frozen method names so that the experiment can
 * inspect upstream evidence without materialising an all-program flow table.
 */
import python
import semmle.python.dataflow.new.DataFlow

predicate qualificationMethod(string name) {
  name = "check_entry" or
  name = "_evaluate_residual_type_invariant" or
  name = "record"
}

module GenericRelationshipConfig implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node node) { any() }

  predicate isSink(DataFlow::Node node) {
    exists(DataFlow::MethodCallNode call |
      node = call.getFunction() and
      qualificationMethod(call.getMethodName())
    )
  }

  int accessPathLimit() { result = 5 }
}

module GenericRelationshipFlow = DataFlow::Global<GenericRelationshipConfig>;

from DataFlow::Node source, DataFlow::MethodCallNode sink
where
  GenericRelationshipFlow::flow(source, sink.getFunction()) and
  qualificationMethod(sink.getMethodName()) and
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
