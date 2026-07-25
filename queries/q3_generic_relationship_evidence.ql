/**
 * Q3 generic relationship-evidence harness.
 *
 * The reusable relation is the configured global flow from an arbitrary
 * attribute read to an exact method-call function node.  This lets CodeQL
 * expose constructor/field/argument/parameter flow when its Python extractor
 * models those steps.  The method-name predicate is only the frozen
 * qualification selector; no repository-specific receiver or caller is used
 * to create a result.
 */
import python
import semmle.python.dataflow.new.DataFlow

predicate qualificationMethod(string name) {
  name = "check_entry" or
  name = "_evaluate_residual_type_invariant" or
  name = "record"
}

module RelationshipEvidenceConfig implements DataFlow::ConfigSig {
  predicate isSource(DataFlow::Node node) {
    node instanceof DataFlow::AttrRead
  }

  predicate isSink(DataFlow::Node node) {
    exists(DataFlow::MethodCallNode call |
      node = call.getFunction() and
      qualificationMethod(call.getMethodName())
    )
  }

  int accessPathLimit() { result = 5 }
}

module RelationshipEvidenceFlow = DataFlow::Global<RelationshipEvidenceConfig>;

from DataFlow::AttrRead source, DataFlow::MethodCallNode sink
where
  RelationshipEvidenceFlow::flow(source, sink.getFunction()) and
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
  sink.getObject().toString(),
  source.getAttributeName(),
  source.getObject().toString(),
  source.toString(),
  source.getLocation(),
  source.getLocation().getFile().getRelativePath(),
  source.getLocation().getStartLine(),
  source.getLocation().getStartColumn()
