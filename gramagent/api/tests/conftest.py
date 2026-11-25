import os
import tempfile
os.environ['GRAM_DATA_DIR']=tempfile.mkdtemp(prefix='gramagent-test-')
os.environ['GRAM_JWT_SECRET']='test-secret-only-not-for-production-1234567890'
os.environ['GRAM_BOOTSTRAP_EMAIL']='admin@example.test'
os.environ['GRAM_BOOTSTRAP_PASSWORD']='test-password-very-long-123'
os.environ['GRAM_MODEL_PROVIDER']='none'
os.environ['GRAM_MONGO_URI']=''
